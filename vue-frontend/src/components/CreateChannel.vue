<script setup>
</script>

<template>
    <div>
        <h1>Create Channel</h1>
        <form @submit.prevent="create">
            <label for="channelName">Channel name:</label>
            <input type="text" id="channelName" required />

            <button type="submit">Create</button>
        </form>
    </div>
</template>

<script>
    export default {
        data(){
            return {
                name: null,
                user_id: null,
            }
        },
        methods: {
            async getUSer() {
                try {
                    const resp = await fetch("http://localhost:3000/api/penggunas/me", {
                        method: "GET",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                    if (!resp.ok) {
                        const errorMsg = (await req.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json() 

                    this.user_id = response.user.id

                } catch (error) {
                    alert(error.message);
                }
            },
            async create(){
                this.name = channelName.value
                console.log(this.name)
                console.log(this.user_id)

                try {
                    const resp = await fetch("http://localhost:3000/api/channels", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-type": "application/json"
                        },
                        body: JSON.stringify({
                            channel_name: this.name,
                            owner: this.user_id,
                        })
                    })

                    if(!resp.ok){
                        const errorMsg = (await resp.json())?.errors[0].message;
                        throw new Error(errorMsg);
                    }

                    const response = await resp.json()
                    console.log(response)

                    alert("Channel created succesfully")

                    this.$router.push("/browse")
                } catch(error) {
                    alert(error.message)
                }
            }
        },

        mounted(){
            this.getUSer()
            .catch(error => {
                console.error(error);
            });
        }
    }
</script>